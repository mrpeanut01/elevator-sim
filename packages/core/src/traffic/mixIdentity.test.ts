/**
 * **The opt-in guard for the directional-mix arc.** A run under a template that declares no mix
 * must produce the trace it produced before mixes could vary — the same batches, the same
 * destinations, the same masses, the same object shape, bit for bit.
 *
 * `DECISIONS.md` § D151 § 7 fixed this in advance, before the template existed: *"It must be
 * opt-in and byte-identical when unused. Every existing published number must reproduce exactly; a
 * traffic-model change that moves a shipped figure invalidates far more than this phase."*
 *
 * ## Why a digest of the whole trace, and why measured somewhere else
 *
 * Modelled on `transportIdentity.test.ts`, which is the file this repository already trusts for
 * this question, and for its reasons. A test comparing passenger *counts* would miss a
 * destination drawn from a reweighted table; one comparing the first batch would miss a shift at
 * minute twenty; one re-running this tree twice would prove only that the code is deterministic,
 * which was never in question. The question is whether *this* tree reproduces *that* tree.
 *
 * So {@link BASELINE_TRACE_DIGESTS} is pinned (re-pinned 2026-07-30) to what commits **`9f1adf7`**,
 * **`9fd738c`** and HEAD all reproduce on the runner that re-pinned it — Node 22 and Node 26 agree
 * byte for byte, and `goldenRuns` replays stored records byte-identically on the same runner, so
 * the apparatus distinguishes a moved run from a moved pin. The previous constants — kept in the
 * superseded block inside the table, per this file's own re-pin convention — claimed that
 * provenance and did not have it: they matched **no committed tree**, provenance unknown, produced
 * from an unmeasurable working state. DECISIONS.md § D196 carries the finding. It is a pin in the
 * sense `experiments/benchmark/published.ts` means: a number this tree must reproduce and did not
 * compute for itself.
 *
 * ## Nothing is excluded, and nothing needed to be
 *
 * `transportIdentity.test.ts` had to delete one field before hashing, because the baseline had no
 * such key. This one deletes nothing. `ResolvedDemandTemplate.meanDirectionalSplit`,
 * `DemandPhase.startSplit`/`endSplit` and `DemandSource.categoryRates` are all **omitted rather
 * than emptied** when the template declares no mix, so the serialized trace is the object it was
 * rather than an equivalent one — which is what lets the whole trace be hashed with no carve-out
 * to argue about.
 *
 * ## The two halves, and why the second one is not decoration
 *
 * The first half pins the two shipped templates. The second pins the new one — including the
 * property that makes it a *template* rather than a rewrite: the flat-mix control
 * (`mixAmplitude: 0`) generates exactly the trace a fixed 45/45/10 split generates, so
 * `DECISIONS.md` § D162 condition 5's negative control is the pre-existing code path with the mean
 * held, not a second implementation that could disagree with the first. A guard that only checked
 * the unused case would pass on a build where the *used* case did nothing at all.
 */

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, DATA_DIR, load } from '../sim/fixtures.test-helper.js';

import { splitAt } from './demandTemplate.js';
import { generateTrace } from './generator.js';
import { DEMAND_TEMPLATE_IDS, type DemandTemplateId } from './types.js';

/**
 * SHA-256 of `JSON.stringify(generateTrace(...))` at `seed: 20260726` with every other option
 * left at its default, one entry per (building, template).
 *
 * Re-pinned 2026-07-30 to the values commits `9f1adf7`, `9fd738c` and HEAD all reproduce (Node 22
 * and 26 agree). The constants replaced are kept in the superseded block below (§ D196).
 */
const BASELINE_TRACE_DIGESTS: Readonly<Record<string, string>> = {
  /*
   * **All ten digests are re-pinned (2026-07-30), and the previous constants matched no committed
   * tree.**
   *
   * The values below are what commits `9f1adf7`, `9fd738c` and HEAD all reproduce on the runner
   * that re-pinned them — Node 22 and Node 26 agree byte for byte, while `goldenRuns` replays
   * stored run records byte-identically on the same runner. The constants they replace reproduced
   * on **none** of those commits and on no other committed tree that was checked: provenance
   * unknown, produced from an unmeasurable working state. `BASELINE_PASSENGER_COUNTS` never moved
   * — the pinned counts pass on every commit above — so whatever produced the superseded digests
   * shared this tree's demand and differed somewhere the digest sees and the counts do not.
   * DECISIONS.md § D196 carries the finding.
   *
   * Superseded, kept per this file's re-pin convention (none reproduces from any committed tree):
   *
   *   'garden-apartments|rise-and-fall':
   *     'c196360dd70df5eccc89c91aea5533861522c202ee474ed84399c1be1c3da131',
   *   'garden-apartments|constant-iso':
   *     '6f91e537c91540825bd0495393d962427eeeb27a5fb8a42a8c6a152da373d458',
   *   'midtown-office|rise-and-fall':
   *     'aef42eca6f16b573519aa649884d1c944cad700d5f4c817f411e651d770b3117',
   *   'midtown-office|constant-iso':
   *     '23f759bd026047ae52fd8720dd87aa822642fc56cdd46b3e40810e529a8483bc',
   *   'mixed-use-high-rise|rise-and-fall':
   *     'fc30a7ba19798c69e1fb87c2a7fa92f2e44616b3d3d02cef355a99ff39953659',
   *   'mixed-use-high-rise|constant-iso':
   *     '7af7fc5472a3296361157a97bf217b76a5d24e84c000f23f66d0756c722d4a28',
   *   'secure-tower|rise-and-fall':
   *     '022e163901a9f1c268126cdcb610f7cfe6b6736dec48bb74ca18408142506607',
   *   'secure-tower|constant-iso':
   *     '02cae53573243fefbe20d811114a1184f88e2c840791aab8df58a7b73790c668',
   *   'vertical-city|rise-and-fall':
   *     'a37d59c4e101bd0f229d6cec130efb36da44214f6f9ebd02090a165486899502',
   *   'vertical-city|constant-iso':
   *     '74e108c52d7468b65853665e1f72b77a47bfac7c36dcd6563b2779a633a6be52',
   */
  'garden-apartments|rise-and-fall':
    'e0c37900df2781979ba6bb0098ec9e53545aaa8711a10bf24e923b99c6c5ab7f',
  'garden-apartments|constant-iso':
    '05c4c74873ab72405ff746e5b1a78914f7e970719a31ddb50c6e1af855c3d984',
  'midtown-office|rise-and-fall':
    '7bfe6a021ebf93b8696f9e9770f95e5ff5231363020041e1a6ec310e70ed8f5b',
  'midtown-office|constant-iso':
    'aee5a7726fec2cf9b9e78095a56eb6bd9cc075f6b8c63dbb1b32ef0e0c29b94e',
  'mixed-use-high-rise|rise-and-fall':
    'dee292c841cbdb12570a52fc59e3b4a6dc2364ba8260e6fc408da5d8070ce5ee',
  'mixed-use-high-rise|constant-iso':
    'f17a16503eb5a43049be32877fbf169b502ebc3d68337a2bb829dc2a24039199',
  'secure-tower|rise-and-fall':
    '2b17c11b2b0c824372816d9292280fa5ac6f74ec8446bc01b14d20ff6a12b579',
  'secure-tower|constant-iso':
    '3810ffd3f33b78c21b48694cf2d9c4329e73541a44e8c432c71e625f6f6ae3c3',
  /*
   * **The two `vertical-city` digests are re-pinned, and the cause is a different lane's data
   * change rather than this file's code.**
   *
   * Both were generated at `9f1adf7`, and both moved when `vertical-city` declared escalators at
   * its three sky lobbies ([§ D170](../../../../DECISIONS.md)) — a concurrent lane that branched
   * from the same commit, so neither lane could see the other's guard. The trace moved because
   * **26 journeys are routed over different floors**: `30 → 45` stops going `30>26>G>2>27>45` and
   * goes `30>26>27>45`, and lift legs fall 3 257 → 3 245 across the same 1 956 journeys.
   *
   * What proves this is a route change and not a demand change: **`BASELINE_PASSENGER_COUNTS` did
   * not move** — same passengers, same arrival instants, different floors between them — and the
   * eight digests for the four buildings that declare no transport mode reproduce untouched. A
   * change that had leaked into the generator rather than into one building's data would have
   * moved those too, and that is the assertion doing the work here.
   *
   * The two constants that re-pin produced are themselves superseded by the 2026-07-30 re-pin —
   * they claimed generation at `9f1adf7` and reproduced from no committed tree, the same § D196
   * finding as the eight above, and they are kept in the superseded block with the others. The
   * route-change mechanism this comment records still stands: the passenger counts have not moved,
   * and the re-pinned values are of the escalator-declaring building.
   */
  'vertical-city|rise-and-fall':
    '8a234e46f9aa524ee334fa9853ab194b1c676c72de323cad708e234148204f0f',
  'vertical-city|constant-iso':
    'cf217b5aa99c381df1af832b2a5d713d2b157cb2b4d6e9e2d98d5ddc5c881134',
};

/** Passenger counts at the same seed, so a failure says *how much* moved as well as *that* it did. */
const BASELINE_PASSENGER_COUNTS: Readonly<Record<string, number>> = {
  'garden-apartments|rise-and-fall': 29,
  'garden-apartments|constant-iso': 144,
  'midtown-office|rise-and-fall': 660,
  'midtown-office|constant-iso': 4965,
  'mixed-use-high-rise|rise-and-fall': 757,
  'mixed-use-high-rise|constant-iso': 5278,
  'secure-tower|rise-and-fall': 396,
  'secure-tower|constant-iso': 2844,
  'vertical-city|rise-and-fall': 1956,
  'vertical-city|constant-iso': 13086,
};

/** The two that existed at `9f1adf7`. Derived below, never hand-listed, so a third fails loudly. */
const SHIPPED_BEFORE: readonly DemandTemplateId[] = ['rise-and-fall', 'constant-iso'];

const SEED = 20_260_726n;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

interface Measured {
  readonly digest: string;
  readonly passengers: number;
}

function measure(buildingId: string, template: DemandTemplateId, mixAmplitude?: number): Measured {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  const trace = generateTrace({
    building,
    profiles: config.trafficProfiles,
    streams: new StreamSet(SEED),
    template,
    ...(mixAmplitude === undefined ? {} : { templateOverrides: { mixAmplitude } }),
  });
  return {
    digest: createHash('sha256').update(JSON.stringify(trace)).digest('hex'),
    passengers: trace.passengerCount,
  };
}

describe('a template that declares no directional mix generates exactly the trace it did before', () => {
  it('loads the shipped data directory', () => {
    expect(config.dataDir).toBe(DATA_DIR);
  });

  /*
   * Derived from the shipped id list rather than written twice. The partition is the thing that
   * can go stale — add a fourth template and this assertion names it, instead of the pins below
   * quietly covering two of four and reporting green.
   */
  it('exactly one shipped template varies the mix, and it is the one added for it', () => {
    expect([...DEMAND_TEMPLATE_IDS]).toEqual([...SHIPPED_BEFORE, 'lunch-two-way']);
    for (const id of SHIPPED_BEFORE) {
      const record = config.trafficProfiles.demandTemplates.find((entry) => entry.id === id);
      expect(record?.directionalSplitAtStart, id).toBeUndefined();
      expect(record?.directionalSplitAtEnd, id).toBeUndefined();
    }
  });

  for (const buildingId of BUILDING_IDS) {
    for (const template of SHIPPED_BEFORE) {
      const key = `${buildingId}|${template}`;
      it(`${key} reproduces baseline 9f1adf7 byte for byte`, () => {
        const { digest, passengers } = measure(buildingId, template);
        expect(passengers).toBe(BASELINE_PASSENGER_COUNTS[key]);
        expect(digest).toBe(BASELINE_TRACE_DIGESTS[key]);
      });

      it(`${key} carries no mix field at all`, () => {
        const building = config.buildingsById.get(buildingId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        const trace = generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          template,
        });
        // `in`, not `!== undefined`: the claim is that the keys are absent, which is what makes
        // the digest above an identity rather than an equivalence.
        expect('meanDirectionalSplit' in trace.template).toBe(false);
        expect(trace.template.phases.some((phase) => 'startSplit' in phase)).toBe(false);
        expect(trace.sources.some((source) => 'categoryRates' in source)).toBe(false);
        expect(splitAt(trace.template, trace.durationS / 2)).toBeUndefined();
      });
    }
  }
});

describe('the template that does vary the mix moved, and the flat control did not', () => {
  it('the arc reaches the authored endpoints and passes through the cited period mean', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const { template } = generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
      template: 'lunch-two-way',
    });
    expect(splitAt(template, 0)).toEqual({ incoming: 0, outgoing: 0.9, interfloor: 0.1 });
    expect(splitAt(template, template.durationS)).toEqual({
      incoming: 0.9,
      outgoing: 0,
      interfloor: 0.1,
    });
    // The CIBSE figure, reproduced by the endpoints rather than asserted beside them.
    const mid = splitAt(template, template.durationS / 2);
    expect(mid?.incoming).toBeCloseTo(0.45, 12);
    expect(mid?.outgoing).toBeCloseTo(0.45, 12);
    expect(mid?.interfloor).toBeCloseTo(0.1, 12);
    expect(template.meanDirectionalSplit?.incoming).toBeCloseTo(0.45, 12);
  });

  it('generates a trace unlike the rise-and-fall one it shares its intensity with', () => {
    const arc = measure('midtown-office', 'lunch-two-way');
    expect(arc.digest).not.toBe(BASELINE_TRACE_DIGESTS['midtown-office|rise-and-fall']);
  });

  /*
   * The load-bearing one. § D162 condition 5 requires the flat-mix control to differ from the
   * treatment in the *variation* of the mix and in nothing else — not in the mean mix and not in
   * total demand. Asserting that here, against a trace built the ordinary way with a fixed
   * 45/45/10 split, is what makes the control the pre-existing code path rather than a second
   * implementation of the new one that could drift away from it.
   */
  it('mixAmplitude 0 draws the same passengers as an ordinary fixed 45/45/10 run', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const flatByTemplate = generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
      template: 'lunch-two-way',
      templateOverrides: { mixAmplitude: 0 },
    });
    const flatBySplit = generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
      // The same intensity geometry and the same window, so the only thing left to compare is the
      // mix — `lunch-two-way` inherits rise-and-fall's ramp/hold/ramp and reports the whole run.
      template: 'rise-and-fall',
      templateOverrides: { durationS: flatByTemplate.durationS },
      directionalSplit: { incoming: 0.45, outgoing: 0.45, interfloor: 0.1 },
    });
    /*
     * Three kinds of field are excluded, each named and each asserted separately below rather
     * than waved away — the difference between excluding a field and hiding one.
     *
     * - `template` and `sources` describe the *configuration*, and the two configurations are
     *   different by construction: one states its mix on the template, the other on the split.
     * - the report window and `inReportWindow` differ because `lunch-two-way` reports the whole
     *   run and `rise-and-fall` reports its peak 5 minutes. That is a reporting choice, not a
     *   passenger; the passengers are what this assertion is about.
     */
    const EXCLUDED = new Set([
      'template',
      'sources',
      'reportWindowStartS',
      'reportWindowEndS',
      'passengersInReportWindow',
      'inReportWindow',
    ]);
    const strip = (value: unknown): string =>
      JSON.stringify(value, (key, inner: unknown) => (EXCLUDED.has(key) ? undefined : inner));
    expect(strip(flatByTemplate)).toBe(strip(flatBySplit));
    expect(flatByTemplate.passengerCount).toBe(flatBySplit.passengerCount);
    // The exclusions, asserted rather than assumed. If the windows ever coincided, the two
    // stripped comparisons above would be weaker than they look and this would say so.
    expect([flatByTemplate.reportWindowStartS, flatByTemplate.reportWindowEndS]).toEqual([0, 1800]);
    expect([flatBySplit.reportWindowStartS, flatBySplit.reportWindowEndS]).toEqual([750, 1050]);
    expect(flatByTemplate.sources).not.toEqual(flatBySplit.sources);
  });

  /*
   * Two refusals, both of which would otherwise resolve silently in favour of one input. A caller
   * who set an explicit split and got the template's instead would have no way to notice, and a
   * template with one authored endpoint would get an arc whose other end nobody wrote.
   */
  it('refuses a fixed split and a varying template together, by name', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    expect(() =>
      generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: 'lunch-two-way',
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
      }),
    ).toThrow(/varies the directional mix within the run/);
  });

  it('refuses a phase that declares one endpoint mix and not the other', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    expect(() =>
      generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: {
          id: 'half-authored',
          name: 'half-authored',
          recommended: false,
          durationS: 600,
          phases: [
            {
              startS: 0,
              endS: 600,
              startIntensity: 1,
              endIntensity: 1,
              startSplit: { incoming: 0.5, outgoing: 0.5, interfloor: 0 },
            },
          ],
          reportWindowStartS: 0,
          reportWindowEndS: 600,
          peakIntensity: 1,
          intensityIntegralS: 600,
          meanDirectionalSplit: { incoming: 0.5, outgoing: 0.5, interfloor: 0 },
        },
      }),
    ).toThrow(/one endpoint mix and not the other/);
  });

  it('conserves total demand across the arc: the same passengers as the flat control', () => {
    const arc = measure('midtown-office', 'lunch-two-way', 1);
    const flat = measure('midtown-office', 'lunch-two-way', 0);
    expect(arc.digest).not.toBe(flat.digest);
    // Not "close": the plan's rate is the sum over categories of `rate_c · split_c(t)/mean_c`,
    // which telescopes to the floor's own lambda at every t, so the *expected* count is equal by
    // construction and the realized counts differ only by the Poisson draw.
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const expectedOf = (mixAmplitude: number): number =>
      generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: 'lunch-two-way',
        templateOverrides: { mixAmplitude },
      }).expectedPassengers;
    expect(expectedOf(1)).toBeCloseTo(expectedOf(0), 9);
  });
});
