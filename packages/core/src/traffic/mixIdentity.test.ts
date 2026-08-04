/**
 * **The opt-in guard for the directional-mix arc.** A run under a template that declares no mix
 * must produce the trace it produced before mixes could vary — the same batches, the same
 * destinations, the same masses.
 *
 * `DECISIONS.md` § D151 § 7 fixed this in advance, before the template existed: *"It must be
 * opt-in and byte-identical when unused. Every existing published number must reproduce exactly; a
 * traffic-model change that moves a shipped figure invalidates far more than this phase."*
 *
 * ## What "identical" means here, and why it stopped meaning "bit for bit"
 *
 * A test comparing passenger *counts* would miss a destination drawn from a reweighted table; one
 * comparing the first batch would miss a shift at minute twenty; one re-running this tree twice
 * would prove only that the code is deterministic, which was never in question. So the guard is a
 * digest of the whole result, and it has to be.
 *
 * It used to be a digest of the whole result **including every double at full precision**, pinned
 * from a detached worktree at `9f1adf7`. That asserted a bit-identical trace on every machine, and
 * CI's two-OS matrix proved the claim false: x64 and arm64 differ in the last bits of the
 * Box–Muller and exponential draws, so the pins passed on whichever platform last regenerated them
 * and failed on the other ([§ D196](../../../../DECISIONS.md),
 * [§ D201](../../../../DECISIONS.md)).
 *
 * Bit-equality across machines was never what § D151 § 7 asked for. The guard now splits in two:
 * {@link BASELINE_STRUCTURAL_DIGESTS} pins every **decision** exactly — which floors, which routes,
 * which legs, which credential, which batch — and {@link BASELINE_CONTINUOUS} holds the
 * **magnitudes** those decisions carry to a relative tolerance seven orders of magnitude below the
 * smallest effect this project reports. A reweighted destination table still fails the first half;
 * a changed arrival distribution still fails the second; a fused multiply-add fails neither.
 *
 * ## Why nothing needs excluding from the structural half
 *
 * `ResolvedDemandTemplate.meanDirectionalSplit`, `DemandPhase.startSplit`/`endSplit` and
 * `DemandSource.categoryRates` are all **omitted rather than emptied** when the template declares
 * no mix, and the assertion below checks that directly rather than relying on the digest to notice.
 * The structural digest is an allow-list of decision fields, so a field added to the trace has to
 * be classified by whoever adds it instead of silently joining a hash.
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

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, DATA_DIR, load } from '../sim/fixtures.test-helper.js';

import { splitAt } from './demandTemplate.js';
import { generateTrace } from './generator.js';
import {
  continuousSummaryOf,
  structuralDigestOf,
  summaryDisagreements,
  type ContinuousSummary,
} from './identity.test-helper.js';
import { DEMAND_TEMPLATE_IDS, type DemandTemplateId } from './types.js';

/**
 * The **structural** digest of `generateTrace(...)` at `seed: 20260726`, one entry per (building,
 * template) — every routing and identity decision, and nothing continuous.
 *
 * ## Why these are not the whole-trace digests they replace
 *
 * This table used to hold `SHA-256(JSON.stringify(trace))`, which pinned every double at full
 * precision and therefore asserted a **bit-identical trace on every machine**. CI's two-OS matrix
 * showed that claim is false and unfixable: x64 and arm64 disagree in the last bits of the
 * Box–Muller and exponential draws, so the same 26 pins passed on one platform and failed on the
 * other depending only on which machine last regenerated them
 * ([§ D196](../../../../DECISIONS.md), [§ D201](../../../../DECISIONS.md)).
 *
 * Bit-equality across machines was never the requirement. **The same people going the same places
 * by the same routes** is, and {@link structuralDigestOf} pins exactly that: floor indices, leg
 * order, transport hops, credentials, batches, sources. The magnitudes those decisions carry —
 * arrival instants, body masses, traversal times — are held separately by
 * {@link BASELINE_CONTINUOUS}, within a tolerance far below any real effect.
 *
 * This keeps every bit of the regression power the old table had over what this file actually
 * describes. § D170's escalator change is *"26 journeys routed over different floors"*, and a route
 * change still moves these digests exactly as it moved the old ones.
 *
 * Regenerated on this tree rather than inherited from `9f1adf7`: the structural digest is a
 * different function, so a value carried over from the old table would be meaningless. What makes
 * them trustworthy is not their provenance but that **both CI platforms reproduce them**, which is
 * a stronger guarantee than the old table ever had.
 */
const BASELINE_STRUCTURAL_DIGESTS: Readonly<Record<string, string>> = {
  'garden-apartments|rise-and-fall':
    '94932cba66c85c84c16fd426ad943a31b25d1578ecb25d0e092441e6f7098a41',
  'garden-apartments|constant-iso':
    '2a6b3e658b69fde8412e3833f479e60381dac1b67c94ea101dec747f0ea15e49',
  'midtown-office|rise-and-fall':
    '7a125dc9e71caa4eca9b179e77aab1e293b0e85d31c1d0e5c9d747cbeaebd645',
  'midtown-office|constant-iso':
    '9f20f1e305ad3f85b1c8487de4350c496f73d3af6bdb9a6a1b969311b160c953',
  'mixed-use-high-rise|rise-and-fall':
    'd34eda24a3d1dc6592192e8fcf8b2f56792084833d57d409b1c329deb5f5dee0',
  'mixed-use-high-rise|constant-iso':
    '4c8d601179bf138b08cf902ced56bc9bdff746d6fc085e9c355df9e129d110c4',
  'secure-tower|rise-and-fall':
    '531556403f4764e1ed8c54f036d3e35ea733e33ad78f3d41bfe778f59585c957',
  'secure-tower|constant-iso':
    '1bb96d97f5498072875a4d07f6a380024d6f11b2b2b814562302a463eac9ea80',
  /*
   * **`vertical-city` is the pair that moved for a real reason, and the reason is still recorded.**
   *
   * Both moved when `vertical-city` declared escalators at its three sky lobbies
   * ([§ D170](../../../../DECISIONS.md)), because **26 journeys are routed over different floors**:
   * `30 → 45` stops going `30>26>G>2>27>45` and goes `30>26>27>45`, and lift legs fall 3 257 →
   * 3 245 across the same 1 956 journeys.
   *
   * That is precisely the class of change a *structural* digest exists to catch, and it is the
   * argument for this table's shape: a route change moves it, while the platform noise that made
   * the old whole-trace table unpinnable does not. `BASELINE_PASSENGER_COUNTS` did not move — same
   * passengers, different floors between them — and the eight entries above, for the four buildings
   * that declare no transport mode, are untouched by it.
   */
  'vertical-city|rise-and-fall':
    '09617ebd247d23bbb3094f3f4c214711214fd05d29abacec64e2828217cde601',
  'vertical-city|constant-iso':
    'ce27e7f5b5376bae061668b3b5554e5a2258d53c2e7bb598d72c99e5d1145685',
};

/**
 * The magnitudes the decisions above carry, compared within {@link RELATIVE_TOLERANCE}.
 *
 * Where the cross-platform divergence lives, and the half that says **how much** something moved
 * rather than only that it did — the distinction a hash cannot make and the reason the old
 * whole-trace digest could not tell a single ULP from a rewritten generator.
 */
const BASELINE_CONTINUOUS: Readonly<Record<string, ContinuousSummary>> = {
  'garden-apartments|rise-and-fall': { meanArrivalS: 847.6367065706085, p95ArrivalS: 1351.6368060508266, meanMassKg: 71.4156185907764, totalTraversalS: 0, peakPassengersPerSecond: 0.020000000000000004, expectedPassengers: 21.000000000000004 },
  'garden-apartments|constant-iso': { meanArrivalS: 3745.568677711968, p95ArrivalS: 6930.5415455999255, meanMassKg: 74.74509000347051, totalTraversalS: 0, peakPassengersPerSecond: 0.020000000000000004, expectedPassengers: 144.00000000000003 },
  'midtown-office|rise-and-fall': { meanArrivalS: 888.5665024027812, p95ArrivalS: 1513.516918193317, meanMassKg: 74.63448420237873, totalTraversalS: 0, peakPassengersPerSecond: 0.6839999999999992, expectedPassengers: 718.1999999999991 },
  'midtown-office|constant-iso': { meanArrivalS: 3616.2724618058837, p95ArrivalS: 6864.61959736481, meanMassKg: 75.00886577811919, totalTraversalS: 0, peakPassengersPerSecond: 0.6839999999999992, expectedPassengers: 4924.799999999994 },
  'mixed-use-high-rise|rise-and-fall': { meanArrivalS: 881.139658783469, p95ArrivalS: 1488.8207383396764, meanMassKg: 74.44054135560874, totalTraversalS: 0, peakPassengersPerSecond: 0.7344666666666684, expectedPassengers: 771.1900000000018 },
  'mixed-use-high-rise|constant-iso': { meanArrivalS: 3615.4588901261964, p95ArrivalS: 6841.397685638496, meanMassKg: 75.06081623886115, totalTraversalS: 0, peakPassengersPerSecond: 0.7344666666666684, expectedPassengers: 5288.160000000013 },
  'secure-tower|rise-and-fall': { meanArrivalS: 945.9948854839349, p95ArrivalS: 1583.1102404979658, meanMassKg: 74.98966383945492, totalTraversalS: 0, peakPassengersPerSecond: 0.39679999999999993, expectedPassengers: 416.63999999999993 },
  'secure-tower|constant-iso': { meanArrivalS: 3649.0464453042055, p95ArrivalS: 6859.087877657635, meanMassKg: 75.0898278043077, totalTraversalS: 0, peakPassengersPerSecond: 0.39679999999999993, expectedPassengers: 2856.9599999999996 },
  'vertical-city|rise-and-fall': { meanArrivalS: 911.6524092284869, p95ArrivalS: 1557.4397873388914, meanMassKg: 75.17186668019575, totalTraversalS: 6190.399999999968, peakPassengersPerSecond: 1.8367333333333367, expectedPassengers: 1928.5700000000036 },
  'vertical-city|constant-iso': { meanArrivalS: 3642.6946991280697, p95ArrivalS: 6867.265764370347, meanMassKg: 74.94232198365385, totalTraversalS: 43396.39999999933, peakPassengersPerSecond: 1.8367333333333367, expectedPassengers: 13224.480000000023 },
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
  /** Every routing and identity decision. Compared exactly — it is expected to be portable. */
  readonly digest: string;
  /** The magnitudes those decisions carry. Compared within tolerance. */
  readonly continuous: ContinuousSummary;
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
    digest: structuralDigestOf(trace),
    continuous: continuousSummaryOf(trace),
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
    // **Derived from the records, not from a list with a hard-coded tail.** The previous form was
    // `toEqual([...SHIPPED_BEFORE, 'lunch-two-way'])`, which named the mix-varying template only by
    // being last — so `shift-change` and `evening-egress` failed it merely by existing, while a
    // fourth template that really did vary the mix could have been appended and passed. The comment
    // above asks for the partition; this computes it.
    const varying = config.trafficProfiles.demandTemplates
      .filter((entry) => entry.directionalSplitAtStart !== undefined || entry.directionalSplitAtEnd !== undefined)
      .map((entry) => entry.id);
    expect(varying).toEqual(['lunch-two-way']);

    // Every shipped id has a record, and every record is a shipped id: the two lists cannot drift
    // apart without this failing, which is what makes the filter above trustworthy.
    expect(config.trafficProfiles.demandTemplates.map((entry) => entry.id).sort()).toEqual(
      [...DEMAND_TEMPLATE_IDS].sort(),
    );

    // And the templates whose traces are pinned below still declare no mix, which is the property
    // those pins depend on.
    for (const id of SHIPPED_BEFORE) {
      const record = config.trafficProfiles.demandTemplates.find((entry) => entry.id === id);
      expect(record?.directionalSplitAtStart, id).toBeUndefined();
      expect(record?.directionalSplitAtEnd, id).toBeUndefined();
    }
  });

  for (const buildingId of BUILDING_IDS) {
    for (const template of SHIPPED_BEFORE) {
      const key = `${buildingId}|${template}`;
      it(`${key} routes every journey exactly as pinned, and its magnitudes agree`, () => {
        const { digest, continuous, passengers } = measure(buildingId, template);
        expect(passengers).toBe(BASELINE_PASSENGER_COUNTS[key]);
        /* Decisions: exact. A different floor, leg order or credential fails here. */
        expect(digest, key).toBe(BASELINE_STRUCTURAL_DIGESTS[key]);
        /* Magnitudes: within tolerance, and the message says how far apart they were. */
        const drift = summaryDisagreements(
          continuous,
          BASELINE_CONTINUOUS[key] as ContinuousSummary,
        );
        expect(drift, `${key} continuous drift`).toEqual([]);
      }, 60_000);

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
    expect(arc.digest).not.toBe(BASELINE_STRUCTURAL_DIGESTS['midtown-office|rise-and-fall']);
  }, 60_000);

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
  }, 60_000);
});
