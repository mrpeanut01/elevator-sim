/**
 * **Adding a demand template record changes no existing template's run**, and that is asserted here
 * by *running* rather than by an argument about what `find(id)` can and cannot see.
 * `DECISIONS.md` § D263.
 *
 * `dayStartIdentity.test.ts` is the precedent and the shape is deliberately its: build the shipped
 * `data/` and a copy of it with the new thing removed, run the same seed against both **in the same
 * process**, and require the two outputs equal byte for byte. No pin, no digest, no tolerance — a
 * guard with no pinned constant cannot go stale, and it will still be true on a tree where every
 * number in this repository has moved.
 *
 * ## Why this needs a run, when the mechanism looks obvious
 *
 * `resolveDemandTemplate` looks a record up by id, so a sixth element in an array it never reaches
 * "obviously" cannot matter. That reasoning is exactly what § D245 records going wrong one layer up:
 * `server/leaderboard/submission.ts#configHashOf` digests the **whole** resolved record set, so
 * adding one field to one template forked all five leaderboard boards. A hash, an index, an ordering
 * or a `[0]` is all it takes for the count of records in a file to reach a result, and none of those
 * announce themselves. So the claim asserted here is the strong one — **nothing a simulation
 * produces depends on how many demand templates ship** — and it is asserted at both the trace and
 * the whole-result layer, because a trace is an *input* to a run and something downstream could read
 * the catalogue that a trace comparison would never see.
 *
 * ## And the consequence the new record declares about itself
 *
 * `office-down-peak` inherits `rise-and-fall`'s geometry unchanged — 30 minutes, a 5-minute hold, a
 * zero baseline — so that it adds no duration no source supports, the discipline `lunch-two-way` and
 * `shift-change` were authored under. The price is that the two draw the **same passengers** at the
 * same seed, and the record's own `$comment` says so. § *the same passengers* below turns that
 * sentence into a measurement: a declared identity is not the § D112 defect, but an *undeclared* one
 * would be, and the only way to keep the declaration honest is to fail when it stops being true.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, TrafficProfiles } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import { resolveDemandTemplate } from './demandTemplate.js';
import { generateTrace } from './generator.js';
import { DEMAND_TEMPLATE_IDS, type DemandTemplateId } from './types.js';

const SEED = 20_260_726n;

/** The record § D263 adds. Removing it must reproduce the tree exactly as it was before. */
const ADDED: DemandTemplateId = 'office-down-peak';

/** Every template that shipped before it — the ones whose runs may not move. */
const SHIPPED_BEFORE: readonly DemandTemplateId[] = DEMAND_TEMPLATE_IDS.filter(
  (id) => id !== ADDED,
);

/**
 * The shipped reference data with the new record removed — the tree as it was before § D263.
 *
 * Only that one array element is dropped, and nothing else: the comparison below would be worthless
 * if this function also normalised something that *does* move a run, because the two sides would
 * then agree for a second reason.
 */
function withoutTheNewRecord(profiles: TrafficProfiles): TrafficProfiles {
  return {
    ...profiles,
    demandTemplates: profiles.demandTemplates.filter((template) => template.id !== ADDED),
  };
}

let config: LoadedConfig;
let stripped: TrafficProfiles;

beforeAll(async () => {
  config = await load();
  stripped = withoutTheNewRecord(config.trafficProfiles);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Layer 0 — the two sides really do differ, so nothing below is vacuous
 * -------------------------------------------------------------------------- */

describe('the split shipped two records where there was one', () => {
  it('adds exactly one record, and it is the one named', () => {
    const shipped = config.trafficProfiles.demandTemplates.map((entry) => entry.id);
    const before = stripped.demandTemplates.map((entry) => entry.id);
    expect(shipped).toContain(ADDED);
    expect(before).not.toContain(ADDED);
    expect(shipped.length).toBe(before.length + 1);
    // Every id this module can build **with no record to read** has a record, so `SHIPPED_BEFORE`
    // above is the real set rather than a list that could quietly cover four of five.
    //
    // Asserted as a containment rather than an equality since `DECISIONS.md` § D274: the catalogue
    // is now the wider of the two, because § D273 lets a record author its own `phases` and answer
    // to an id no compiled-in union contains. The extra records are named rather than tolerated, so
    // this still fails on a record nobody meant to add.
    expect(shipped).toEqual(expect.arrayContaining([...DEMAND_TEMPLATE_IDS]));
    expect(shipped.filter((id) => !(DEMAND_TEMPLATE_IDS as readonly string[]).includes(id))).toEqual(
      ['office-day'],
    );
  });

  it('leaves the two records meaning two different things', () => {
    const venue = resolveDemandTemplate('evening-egress', config.trafficProfiles.demandTemplates);
    const office = resolveDemandTemplate(ADDED, config.trafficProfiles.demandTemplates);

    // The venue keeps its own shape: 20 minutes, and a report window that opens at the step rather
    // than in the middle of the run, which is the leading edge the record exists for.
    expect(venue.durationS).toBe(1200);
    expect(venue.reportWindowStartS).toBe(360);
    // The office is the rise-and-fall period: 30 minutes with the reported hold centred.
    expect(office.durationS).toBe(1800);
    expect(office.reportWindowStartS).toBe(750);
    expect(office.reportWindowEndS).toBe(1050);

    // And the hours are the pair that could not both live on one record — 22:30 for a function
    // turning out, 17:30 for a building closing, each placed by its own template's hold.
    expect(venue.startOfDayS).toBe(22 * 3600 + 24 * 60);
    expect(office.startOfDayS).toBe(17 * 3600 + 15 * 60);
  });

  it('gives the new record no directional mix, on purpose', () => {
    // The mix fields mean *the mix moves within the run*, which is `lunch-two-way` and is not a
    // down-peak. Authoring a constant pair here would also make `shift/calendar.ts` withhold
    // `quarter-end`'s own bias, which is where the shipped office down-peak's outgoing pull comes
    // from — so the absence is load-bearing rather than an omission.
    const record = config.trafficProfiles.demandTemplates.find((entry) => entry.id === ADDED);
    expect(record).toBeDefined();
    expect('directionalSplitAtStart' in record!).toBe(false);
    expect('directionalSplitAtEnd' in record!).toBe(false);
    expect('meanDirectionalSplit' in resolveDemandTemplate(ADDED, config.trafficProfiles.demandTemplates)).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Layer 1 — every template that shipped before resolves to exactly what it did
 * -------------------------------------------------------------------------- */

describe('an added record leaves every other template resolving identically', () => {
  for (const id of SHIPPED_BEFORE) {
    it(`${id} is byte-identical with the new record present and absent`, () => {
      const withNew = resolveDemandTemplate(id, config.trafficProfiles.demandTemplates);
      const withoutNew = resolveDemandTemplate(id, stripped.demandTemplates);
      expect(JSON.stringify(withNew), id).toBe(JSON.stringify(withoutNew));
    });
  }
});

/* -------------------------------------------------------------------------- *
 * Layer 2 — the traces, byte for byte
 * -------------------------------------------------------------------------- */

describe('an added record draws no different passenger anywhere', () => {
  for (const buildingId of BUILDING_IDS) {
    for (const id of SHIPPED_BEFORE) {
      const key = `${buildingId}|${id}`;
      it(`${key} draws exactly the same passengers`, () => {
        const building = config.buildingsById.get(buildingId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        const withNew = generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          template: id,
        });
        const withoutNew = generateTrace({
          building,
          profiles: stripped,
          streams: new StreamSet(SEED),
          template: id,
        });

        // The legs first, so a failure says *what* diverged before it says *that* something did.
        expect(JSON.stringify(withNew.passengers), `${key} passengers`).toBe(
          JSON.stringify(withoutNew.passengers),
        );
        expect(JSON.stringify(withNew.arrivals), `${key} arrivals`).toBe(
          JSON.stringify(withoutNew.arrivals),
        );
        expect(JSON.stringify(withNew.sources), `${key} sources`).toBe(
          JSON.stringify(withoutNew.sources),
        );
        // Then the whole object, so a field neither of the three above covers cannot slip past.
        expect(JSON.stringify(withNew), `${key} whole trace`).toBe(JSON.stringify(withoutNew));
      }, 120_000);
    }
  }
});

/* -------------------------------------------------------------------------- *
 * Layer 3 — the whole run, because a trace is an input rather than an answer
 * -------------------------------------------------------------------------- */

describe('an added record leaves every simulation byte-identical', () => {
  // One dispatcher rather than `transportIdentity.test.ts`'s three: the question here is whether the
  // *catalogue* reaches a result, and a second scoring rule cannot answer it a third time. Every
  // building, though, because the catalogue is read per configuration and the buildings differ in
  // banks, zoning and call type.
  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId} runs identically with the new record present and absent`, () => {
      const building = config.buildingsById.get(buildingId);
      const dispatcherProfile = config.dispatcherProfilesById.get('collective');
      if (building === undefined) throw new Error(`no building "${buildingId}"`);
      if (dispatcherProfile === undefined) throw new Error('no profile "collective"');

      const run = (trafficProfiles: TrafficProfiles): unknown =>
        runSimulation({
          building,
          dispatcherProfile,
          trafficProfiles,
          elevatorSpecs: config.elevatorSpecs,
          seed: 20260726,
          // The same allowance `transportIdentity.test.ts` makes, for the same reason.
          onTimeout: 'report',
        });

      expect(JSON.stringify(run(config.trafficProfiles)), buildingId).toBe(
        JSON.stringify(run(stripped)),
      );
    }, 180_000);
  }
});

/* -------------------------------------------------------------------------- *
 * Layer 4 — the consequence the new record declares about itself
 * -------------------------------------------------------------------------- */

describe('the same passengers: office-down-peak shares rise-and-fall’s geometry and says so', () => {
  it('resolves to the same shape, differing only in id, name and hour', () => {
    const upPeak = resolveDemandTemplate('rise-and-fall', config.trafficProfiles.demandTemplates);
    const downPeak = resolveDemandTemplate(ADDED, config.trafficProfiles.demandTemplates);

    // Named explicitly rather than by diffing, so that a *new* difference — a mix, a skewed ramp, a
    // different hold — fails this rather than being absorbed by a loose comparison.
    const { id: _idA, name: _nameA, startOfDayS: _hourA, ...upShape } = upPeak;
    const { id: _idB, name: _nameB, startOfDayS: _hourB, ...downShape } = downPeak;
    expect(JSON.stringify(downShape)).toBe(JSON.stringify(upShape));

    expect(downPeak.id).toBe('office-down-peak');
    expect(downPeak.startOfDayS).not.toBe(upPeak.startOfDayS);
  });

  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId} draws the same legs under both, which is the declaration`, () => {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) throw new Error(`no building "${buildingId}"`);
      const trace = (template: DemandTemplateId): unknown =>
        generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          template,
        }).passengers;

      /*
       * **If this ever fails, the `$comment` on `office-down-peak` is what has to change**, not this
       * expectation. The record states that its geometry is `rise-and-fall`'s and that what it adds
       * is the hour; the moment somebody gives it a skew, a mix or a duration of its own, that
       * sentence stops being true and a reader deserves to be told by a red test rather than by
       * reading two records side by side.
       */
      expect(JSON.stringify(trace(ADDED)), buildingId).toBe(JSON.stringify(trace('rise-and-fall')));
    }, 120_000);
  }
});
