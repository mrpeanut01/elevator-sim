/**
 * **The opt-in guard for the demand template's hour.** Giving a template a time of day must change
 * nothing a simulation does — the same batches, the same destinations, the same masses, the same
 * legs, the same metrics — and that is asserted here **by a run**, not by an argument about which
 * functions read which field. `DECISIONS.md` § D244.
 *
 * `mixIdentity.test.ts` is the precedent and the shape is deliberately its: *opt-in, and
 * byte-identical when unused*. The two guards differ in one way that matters, and it makes this one
 * simpler and stronger.
 *
 * ## Why this file pins nothing
 *
 * `mixIdentity` compares against **digests pinned from an earlier tree**, because the thing it
 * guards — a directional mix arc — genuinely changes a trace when it is used, so "unchanged" can
 * only mean "unchanged from what was measured before". Pins are what that costs, and § D196/§ D201
 * record the cross-platform price of pinning a float.
 *
 * The hour changes a trace **never**, used or unused. So this file asks a stricter question that
 * needs no pin at all: run the *same seed* against the shipped `data/` and against the same `data/`
 * with every `startOfDayMin` stripped, **in the same process**, and require the two outputs to be
 * equal *byte for byte* with the hour keys removed. No tolerance, no digest, no platform caveat —
 * `toBe` on two strings. A guard with no pinned constant cannot go stale, and it will still be true
 * on a tree where every number in this repository has moved.
 *
 * ## The three layers, and why the third is not redundant
 *
 * 1. **The evaluator.** `intensityAt`, `splitAt` and `integratedIntensityS` are the whole of the
 *    template's evaluation surface, sampled on a dense grid with and without the hour.
 * 2. **The trace.** Every building × every shipped template, legs and all.
 * 3. **The result.** The same fifteen (building, dispatcher) cells `transportIdentity.test.ts`
 *    pins. This is the layer that proves the re-pin in that file is exactly one key wide: the
 *    superseded digests are reproduced here from the current code by deleting the key, so *"the
 *    fifteen results moved because the record grew an hour"* is a measurement rather than a claim.
 *    Layer 2 does not imply layer 3 on its own — a trace is an input to a run, and a run that read
 *    the hour anywhere downstream would pass layer 2 and fail here.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, TrafficProfiles } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import {
  integratedIntensityS,
  intensityAt,
  resolveDemandTemplate,
  shiftTemplatePeak,
  splitAt,
} from './demandTemplate.js';
import { generateTrace } from './generator.js';
import { structuralDigestOfResult } from './identity.test-helper.js';
import { DEMAND_TEMPLATE_IDS, type DemandTemplateId } from './types.js';

const SEED = 20_260_726n;

/** The dispatchers `transportIdentity.test.ts` measures, in its order. */
const DISPATCHER_IDS = ['nearest-car', 'eta', 'collective'] as const;

/**
 * The fifteen digests `transportIdentity.test.ts` held **before** templates could carry an hour.
 *
 * They are here rather than there because this is the file that can still produce them: deleting
 * `startOfDayS` from a current result reproduces every one exactly, which is what makes that file's
 * re-pin a one-key delta rather than a re-measurement of unknown width. § D205's re-pin made the
 * same claim in prose, for two of fifteen; this makes it for all fifteen, in a run.
 *
 * **If a future change moves the results, these move with `BASELINE_STRUCTURAL` and the two tables
 * are regenerated together.** A superseded table that cannot be reproduced is the § D201 defect, and
 * the moment that happens this table must be deleted rather than carried.
 *
 * **That happened, and the two tables were regenerated together.** § D254 moved nine of the fifteen
 * results — the three buildings that declare `accessZones`, under all three conventional
 * dispatchers — by taking the credential question off the hall call's pickup floor. Both tables
 * were re-measured in the same run of the same tree, so the one-key claim this file exists to make
 * is still a measurement and not an inheritance: deleting `startOfDayS` from a current result still
 * reproduces the entry below exactly, for all fifteen. The six cells on `garden-apartments` and
 * `midtown-office` were re-measured too and came back **identical**, which is the control.
 */
const SUPERSEDED_STRUCTURAL: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    '63a070bcc4e255ff0034744cb11f633e5c8b4fb55f1bb87efd4f5fce11ef4706',
  'garden-apartments|eta': '515017af532ab0927f67718044c9d1b822c448bc4bb3e53ebeb93301fd05e444',
  'garden-apartments|collective': '954516d3e35e14e306852fb30a53d1e091f01c7f08c387a11be2d8213c0bfb1d',
  'midtown-office|nearest-car': '726a75c4127cefaaa755de5be9f76445230d3cb109c60e9d7bc1090d80c16add',
  'midtown-office|eta': '7a26950af349e3f7573bfc0a63ff11efac034fbbfdf617a822dbc4500c9b852c',
  'midtown-office|collective': '1387235946badd1db220427c45e166a6aa4b1c6bc241696fad602e9000f13b71',
  'mixed-use-high-rise|nearest-car':
    'c99da9cf45e473c66f41afbb78fc7a440e0a2c2135325f775ce151cc067aa9ce',
  'mixed-use-high-rise|eta': 'b14a02635ad23a4db09c20b408c77846af6b7580d485818e557c69cda44e1437',
  'mixed-use-high-rise|collective':
    '995058e616e2aad10a213e62b145110cce7c30d599dafebf09eb068d3a69aa62',
  'secure-tower|nearest-car': 'aace27e171c5eef6163e476e1354d5d1d6426a34a9ac1ad843f5d31bf1365e93',
  'secure-tower|eta': '793a0f7573d11881676c19aa3df5d51647c34d9474a38a37117379b028c5d4ab',
  'secure-tower|collective': '64592076343f41c10545f3402ac86638e48ddc0ba8b996f7c81d0ac8fe1cd68d',
  'vertical-city|nearest-car': 'e16858399b0b6fd77957f50ce6b2724fd51fa343207be90d9f186a2e98379142',
  'vertical-city|eta': 'ca54a212ce9f699487c888b1d748437d151d99ca4df7ff9862e11c22e77b3b3b',
  'vertical-city|collective': 'f73069c0137c0f0ce0eb328bf3e3f6e72d0bef85c68c6d7ba023293c7cc50a1a',
};

/**
 * The shipped reference data with every template's hour removed — the tree as it was before § D244.
 *
 * Only `startOfDayMin` is stripped, and nothing else: the comparison below would be worthless if
 * this function also normalised something that *does* move a run, because the two sides would then
 * agree for a second reason.
 */
function withoutHours(profiles: TrafficProfiles): TrafficProfiles {
  return {
    ...profiles,
    demandTemplates: profiles.demandTemplates.map((template) => {
      const { startOfDayMin, ...rest } = template;
      void startOfDayMin;
      return rest;
    }),
  };
}

/**
 * `JSON.stringify` with every `startOfDayS` erased, at any depth.
 *
 * The key appears twice on a trace — once on the trace and once on its `template` — and once more
 * inside a result that carries the trace. Erasing by *name* rather than by path is deliberate: a
 * third copy appearing somewhere new would be silently tolerated by a path list and is caught here
 * by the presence assertions instead, which name every place the key is allowed to be.
 */
function withoutHourKeys(value: unknown): string {
  return (
    JSON.stringify(value, (key, inner: unknown) => (key === 'startOfDayS' ? undefined : inner)) ??
    'undefined'
  );
}

let config: LoadedConfig;
let stripped: TrafficProfiles;

beforeAll(async () => {
  config = await load();
  stripped = withoutHours(config.trafficProfiles);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Layer 0 — the field is where it is supposed to be, and nowhere else
 * -------------------------------------------------------------------------- */

/** The clock each shipped template resolves to, and `null` for the one that declares none. */
const EXPECTED_HOURS: Readonly<Record<DemandTemplateId, number | null>> = {
  'rise-and-fall': 8 * 3600 + 30 * 60,
  'constant-iso': null,
  'lunch-two-way': 12 * 3600 + 15 * 60,
  'shift-change': 14 * 3600 + 45 * 60,
  'evening-egress': 17 * 3600 + 24 * 60,
};

describe('the hour lands on the resolved template and on the trace, and is absent when unauthored', () => {
  it('every shipped template resolves to the hour its record authors', async () => {
    for (const id of DEMAND_TEMPLATE_IDS) {
      const template = resolveDemandTemplate(id, config.trafficProfiles.demandTemplates);
      const expected = EXPECTED_HOURS[id];
      if (expected === null) {
        // `in`, not `=== undefined`: "no hour" and "midnight" must not serialize alike.
        expect('startOfDayS' in template, id).toBe(false);
      } else {
        expect(template.startOfDayS, id).toBe(expected);
      }
    }
  }, 60_000);

  it('the trace carries the same hour beside durationS, and omits it with the template', async () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    for (const id of DEMAND_TEMPLATE_IDS) {
      const trace = generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: id,
      });
      const expected = EXPECTED_HOURS[id];
      if (expected === null) {
        expect('startOfDayS' in trace, id).toBe(false);
        expect('startOfDayS' in trace.template, id).toBe(false);
      } else {
        expect(trace.startOfDayS, id).toBe(expected);
        // One authority, copied once: the trace may not disagree with the template it names.
        expect(trace.startOfDayS, id).toBe(trace.template.startOfDayS);
      }
    }
  }, 60_000);

  it('a template selected by id with no record to read has no hour', async () => {
    // There is no `TRAFFIC_DEFAULTS.startOfDayS`, on purpose: the hour is data and nothing else, so
    // a shape resolved without a record is a shape without a clock rather than one at some default.
    const template = resolveDemandTemplate('rise-and-fall');
    expect('startOfDayS' in template).toBe(false);
  }, 60_000);

  it('a peak shift moves the busy part and leaves the hour where it was', async () => {
    const template = resolveDemandTemplate(
      'rise-and-fall',
      config.trafficProfiles.demandTemplates,
    );
    const shifted = shiftTemplatePeak(template, 120);
    // The period still began at 08:30; what moved is when it got busy. A shift that also moved the
    // hour would be making the same claim twice.
    expect(shifted.startOfDayS).toBe(template.startOfDayS);
    expect(shifted.reportWindowStartS).toBe(template.reportWindowStartS + 120);
    // And a template with no hour does not acquire one by being shifted.
    const flat = shiftTemplatePeak(
      resolveDemandTemplate('shift-change', withoutHours(config.trafficProfiles).demandTemplates),
      60,
    );
    expect('startOfDayS' in flat).toBe(false);
  }, 60_000);

  it('refuses an hour outside the day, by name, on both paths the schema does not guard', () => {
    // The schema guards `data/`; the builders are exported and can be reached without it.
    expect(() =>
      resolveDemandTemplate({
        id: 'rise-and-fall',
        name: 'rise-and-fall',
        recommended: true,
        durationMin: 30,
        startOfDayMin: 1440,
      }),
    ).toThrow(/startOfDayMin must be seconds after local midnight/);

    // And the already-resolved path, which returns its argument untouched and is therefore the one
    // place a bad hour could otherwise reach a clock unchecked.
    expect(() =>
      resolveDemandTemplate({
        id: 'hand-built',
        name: 'hand-built',
        recommended: false,
        durationS: 600,
        phases: [{ startS: 0, endS: 600, startIntensity: 1, endIntensity: 1 }],
        reportWindowStartS: 0,
        reportWindowEndS: 600,
        peakIntensity: 1,
        intensityIntegralS: 600,
        startOfDayS: -1,
      }),
    ).toThrow(/startOfDayS must be seconds after local midnight/);
  });
});

/* -------------------------------------------------------------------------- *
 * Layer 1 — the evaluator never sees it
 * -------------------------------------------------------------------------- */

describe('intensityAt, splitAt and integratedIntensityS do not read the hour', () => {
  for (const id of DEMAND_TEMPLATE_IDS) {
    it(`${id} evaluates identically with and without an hour`, async () => {
      const withHour = resolveDemandTemplate(id, config.trafficProfiles.demandTemplates);
      const noHour = resolveDemandTemplate(id, stripped.demandTemplates);

      // 441 samples: 401 spanning `[0, durationS]` plus 5 % of overhang at each end, so the
      // out-of-range branches of all three functions are exercised as well as the interior.
      const span = withHour.durationS;
      for (let step = -20; step <= 420; step += 1) {
        const timeS = (span * step) / 400;
        expect(intensityAt(withHour, timeS), `${id} intensityAt(${String(timeS)})`).toBe(
          intensityAt(noHour, timeS),
        );
        expect(splitAt(withHour, timeS), `${id} splitAt(${String(timeS)})`).toEqual(
          splitAt(noHour, timeS),
        );
        expect(
          integratedIntensityS(withHour, 0, timeS),
          `${id} integratedIntensityS(0, ${String(timeS)})`,
        ).toBe(integratedIntensityS(noHour, 0, timeS));
      }
      expect(withHour.intensityIntegralS).toBe(noHour.intensityIntegralS);
      expect(withHour.peakIntensity).toBe(noHour.peakIntensity);
    }, 60_000);
  }
});

/* -------------------------------------------------------------------------- *
 * Layer 2 — the trace, byte for byte
 * -------------------------------------------------------------------------- */

describe('every trace is byte-identical with the hour stripped out of it', () => {
  for (const buildingId of BUILDING_IDS) {
    for (const id of DEMAND_TEMPLATE_IDS) {
      const key = `${buildingId}|${id}`;
      it(`${key} draws exactly the same passengers`, async () => {
          const building = config.buildingsById.get(buildingId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        const withHour = generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          template: id,
        });
        const noHour = generateTrace({
          building,
          profiles: stripped,
          streams: new StreamSet(SEED),
          template: id,
        });

        // The legs first, so a failure says *what* diverged before it says *that* something did.
        expect(JSON.stringify(withHour.passengers), `${key} passengers`).toBe(
          JSON.stringify(noHour.passengers),
        );
        expect(JSON.stringify(withHour.arrivals), `${key} arrivals`).toBe(
          JSON.stringify(noHour.arrivals),
        );
        expect(JSON.stringify(withHour.sources), `${key} sources`).toBe(
          JSON.stringify(noHour.sources),
        );
        // Then the whole object, so a field neither of the two above covers cannot slip past.
        expect(withoutHourKeys(withHour), `${key} whole trace`).toBe(withoutHourKeys(noHour));
        // And the equality above is not vacuous: the stripped side really has no hour, and the
        // shipped side really has one wherever its record authors one.
        expect('startOfDayS' in noHour, `${key} stripped`).toBe(false);
        expect('startOfDayS' in withHour, `${key} shipped`).toBe(EXPECTED_HOURS[id] !== null);
      }, 120_000);
    }
  }
});

/* -------------------------------------------------------------------------- *
 * Layer 3 — the whole run, and the fifteen digests transportIdentity re-pinned
 * -------------------------------------------------------------------------- */

describe('every simulation is byte-identical with the hour stripped out of it', () => {
  for (const buildingId of BUILDING_IDS) {
    for (const dispatcherProfileId of DISPATCHER_IDS) {
      const key = `${buildingId}|${dispatcherProfileId}`;
      it(`${key} runs identically, and reproduces its superseded digest`, async () => {
          const building = config.buildingsById.get(buildingId);
        const dispatcherProfile = config.dispatcherProfilesById.get(dispatcherProfileId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        if (dispatcherProfile === undefined) throw new Error(`no profile "${dispatcherProfileId}"`);

        const run = (trafficProfiles: TrafficProfiles): unknown =>
          runSimulation({
            building,
            dispatcherProfile,
            trafficProfiles,
            elevatorSpecs: config.elevatorSpecs,
            seed: 20260726,
            // `mixed-use-high-rise` leaves journeys in the system under `nearest-car`; the same
            // allowance `transportIdentity.test.ts` makes, for the same reason.
            onTimeout: 'report',
          });

        const withHour = run(config.trafficProfiles);
        const noHour = run(stripped);
        expect(withoutHourKeys(withHour), `${key} whole result`).toBe(withoutHourKeys(noHour));

        /*
         * The delta proof `transportIdentity.test.ts`'s re-pin rests on. Deleting the key from a
         * *current* result reproduces the digest that file held before the hour existed — so the
         * fifteen pins there moved by one key and by nothing else. This is the claim § D205 made in
         * prose for two of fifteen.
         */
        const clone = JSON.parse(withoutHourKeys(withHour)) as {
          conservation: { transportHops?: number };
          summary: Record<string, unknown>;
        };
        delete clone.conservation.transportHops;
        delete clone.summary.awtInvalidGround;
        expect(structuralDigestOfResult(clone), `${key} superseded digest`).toBe(
          SUPERSEDED_STRUCTURAL[key],
        );
      }, 180_000);
    }
  }
});
