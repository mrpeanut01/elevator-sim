/**
 * **The guard for the authored phase list.** `DECISIONS.md` § D273.
 *
 * Two claims, and both are proved by *running* rather than by pinning — `dayStartIdentity.test.ts`
 * is the shape, and its argument for pinning nothing carries over unchanged: a guard with no pinned
 * constant cannot go stale, and it will still be true on a tree where every number here has moved.
 *
 * ## Claim 1 — composition identity: the new path is the same evaluator
 *
 * A record that authors `rise-and-fall`'s own knots as an explicit phase list must draw **the same
 * passengers at the same seed**, at every building, byte for byte. That is what makes the phase-list
 * path a *feeding* of the existing piecewise-linear evaluator rather than a second one beside it —
 * and it is the claim that would be false if `phaseListTemplate` normalised a knot, reordered a
 * phase, or derived `intensityIntegralS` differently from `finish`.
 *
 * The comparison excludes exactly three things, and all three are asserted explicitly below rather
 * than waved away: the `id`, the `name`, and the **report window**, which is `[750, 1050]` for
 * `rise-and-fall` and the whole run for every phase list (see `phaseListTemplate`'s note on why a
 * schedule reports the whole of itself). The `authoredPhaseList` marker is the fourth and is
 * asserted in both directions. Everything the evaluator reads — `durationS`, every phase, every
 * intensity, `peakIntensity`, `intensityIntegralS`, `meanDirectionalSplit` — is compared, and then
 * the legs on top of that. The **hour** is matched rather than excluded: the record under test
 * authors `rise-and-fall`'s own 08:30, because excluding a key to make a comparison pass is how a
 * comparison stops covering the thing it was written for.
 *
 * ## Claim 2 — adding a record moves nothing that shipped before it
 *
 * `data/traffic-profiles.json` grew `office-day`, and the five records that were there already must
 * resolve, trace and run exactly as they did. Three layers, and the third is not implied by the
 * second: *"a sixth element in an array `resolveDemandTemplate` never reaches cannot matter"* is the
 * reasoning that is false one layer up, where a hash, an index, an ordering or a `[0]` can put the
 * **count** of records into a result without announcing itself.
 *
 * ## And one claim that is about the record rather than the path
 *
 * `office-day` says, in its own `$comment`, that its 12:15–12:45 mix **is** `lunch-two-way`'s arc
 * rather than an approximation of it. That is a checkable sentence, so it is checked: the two are
 * compared knot for knot and on a dense grid across the whole cited period. If the record's
 * geometry ever moves, this is the test that says the `$comment` is now a claim the data does not
 * keep — which is § D263's rule that *"if that identity ever breaks, the `$comment` is what changes,
 * not the test"*, pointed at a mix instead of at a shape.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DemandTemplate, LoadedConfig, TrafficProfiles } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import {
  integratedIntensityS,
  intensityAt,
  resolveDemandTemplate,
  splitAt,
} from './demandTemplate.js';
import { generateTrace } from './generator.js';
import { DEMAND_TEMPLATE_IDS, TrafficError, type ResolvedDemandTemplate } from './types.js';

const SEED = 20_260_805n;

/** The id of the shipped day profile, and the only phase-list record in `data/`. */
const DAY_ID = 'office-day';

/**
 * `rise-and-fall`'s knots, authored as a record.
 *
 * Written out rather than derived from the shipped template on purpose: deriving them would make
 * this test compare the builder against itself. These are the numbers `riseAndFallTemplate()`
 * produces at its own defaults — 1800 s, a 300 s hold, a zero baseline — restated in minutes as a
 * `data/` author would have to write them, so the test fails if either side moves.
 */
const RISE_AND_FALL_AS_PHASES: DemandTemplate = Object.freeze({
  id: 'rise-and-fall-as-phases',
  name: 'rise-and-fall, authored phase by phase',
  recommended: true,
  durationMin: 30,
  // The hour too (§ D244). Not because it can change a trace — it provably cannot — but because it
  // is *carried onto* one, so leaving it off would make the comparison below differ for a reason
  // that has nothing to do with the phase list and would have to be excluded to hide it.
  startOfDayMin: 510,
  phases: Object.freeze([
    { startMin: 0, endMin: 12.5, startIntensity: 0, endIntensity: 1 },
    { startMin: 12.5, endMin: 17.5, startIntensity: 1, endIntensity: 1 },
    { startMin: 17.5, endMin: 30, startIntensity: 1, endIntensity: 0 },
  ]),
});

/**
 * The four keys that spell the **one** difference the composition comparison tolerates.
 *
 * A phase list reports the whole of itself and `rise-and-fall` reports its peak five minutes, so
 * the window differs by construction — as its two bounds on the trace, as the per-leg
 * `inReportWindow` label those bounds produce, and as the count of legs carrying that label. That
 * is one exclusion written four ways, not four exclusions, and it is asserted explicitly in the
 * tests below rather than waved away: the bounds by value, and the labelling by what it does to
 * every leg and to the count.
 *
 * Nothing else is excluded. In particular the **hour** is not, because the record under test
 * authors `rise-and-fall`'s own 08:30 — excluding a key rather than matching it is how a comparison
 * quietly stops covering the thing it was written for.
 */
const WINDOW_KEYS: ReadonlySet<string> = new Set([
  'reportWindowStartS',
  'reportWindowEndS',
  'inReportWindow',
  'passengersInReportWindow',
]);

/**
 * `JSON.stringify` with {@link WINDOW_KEYS} erased, at any depth.
 *
 * Erasing by *name* rather than by path, following `dayStartIdentity.test.ts`: a second copy of one
 * of these keys appearing somewhere new is silently tolerated by a path list and is caught here by
 * the explicit assertions instead.
 */
function compare(value: unknown): string {
  return (
    JSON.stringify(value, (key, inner: unknown) =>
      WINDOW_KEYS.has(key) ? undefined : inner,
    ) ?? 'undefined'
  );
}

/** The shipped reference data with the day profile removed — the file as it was before § D273. */
function withoutTheDay(profiles: TrafficProfiles): TrafficProfiles {
  return {
    ...profiles,
    demandTemplates: profiles.demandTemplates.filter((template) => template.id !== DAY_ID),
  };
}

let config: LoadedConfig;
let stripped: TrafficProfiles;

beforeAll(async () => {
  config = await load();
  stripped = withoutTheDay(config.trafficProfiles);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Claim 1 — composition identity
 * -------------------------------------------------------------------------- */

describe('a phase list reproducing rise-and-fall is rise-and-fall', () => {
  it('resolves to the same evaluator: duration, knots, peak, integral', async () => {
    const shape = resolveDemandTemplate('rise-and-fall', config.trafficProfiles.demandTemplates);
    const authored = resolveDemandTemplate(RISE_AND_FALL_AS_PHASES);

    expect(authored.durationS).toBe(shape.durationS);
    // The knots themselves, in order. This is the comparison the whole design rests on: if these
    // agree, the two templates are the *same function*, because the evaluator reads nothing else.
    expect(authored.phases).toEqual(shape.phases);
    expect(authored.peakIntensity).toBe(shape.peakIntensity);
    expect(authored.intensityIntegralS).toBe(shape.intensityIntegralS);
    expect('meanDirectionalSplit' in authored).toBe(false);
    expect('meanDirectionalSplit' in shape).toBe(false);

    // The excluded differences, asserted rather than assumed — and the hour, which is *matched*.
    expect(authored.id).toBe('rise-and-fall-as-phases');
    expect(shape.id).toBe('rise-and-fall');
    expect(authored.startOfDayS).toBe(shape.startOfDayS);
    expect(shape.reportWindowStartS).toBe(750);
    expect(shape.reportWindowEndS).toBe(1050);
    expect(authored.reportWindowStartS).toBe(0);
    expect(authored.reportWindowEndS).toBe(1800);
    // And the marker, both ways: the shipped shape must not acquire the key.
    expect(authored.authoredPhaseList).toBe(true);
    expect('authoredPhaseList' in shape).toBe(false);
  }, 60_000);

  it('evaluates identically at every sampled instant, overhang included', async () => {
    const shape = resolveDemandTemplate('rise-and-fall', config.trafficProfiles.demandTemplates);
    const authored = resolveDemandTemplate(RISE_AND_FALL_AS_PHASES);
    for (let step = -20; step <= 420; step += 1) {
      const timeS = (shape.durationS * step) / 400;
      expect(intensityAt(authored, timeS), `intensityAt(${String(timeS)})`).toBe(
        intensityAt(shape, timeS),
      );
      expect(
        integratedIntensityS(authored, 0, timeS),
        `integratedIntensityS(0, ${String(timeS)})`,
      ).toBe(integratedIntensityS(shape, 0, timeS));
    }
  }, 60_000);

  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId} draws exactly the same passengers under either form`, async () => {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) throw new Error(`no building "${buildingId}"`);

      const fromShape = generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: 'rise-and-fall',
      });
      const fromPhases = generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: resolveDemandTemplate(RISE_AND_FALL_AS_PHASES),
      });

      // The legs first, so a failure says *what* diverged before it says *that* something did.
      expect(compare(fromPhases.passengers), `${buildingId} passengers`).toBe(
        compare(fromShape.passengers),
      );
      expect(compare(fromPhases.arrivals), `${buildingId} arrivals`).toBe(
        compare(fromShape.arrivals),
      );
      expect(compare(fromPhases.sources), `${buildingId} sources`).toBe(
        compare(fromShape.sources),
      );
      // Then everything on the trace that is not the template itself, so a field neither of the
      // three above covers cannot slip past. `template` is excluded because its id, name and window
      // differ by construction — and every part of it the evaluator reads is compared above.
      const withoutTemplate = ({ template, ...rest }: typeof fromShape): unknown => {
        void template;
        return rest;
      };
      expect(compare(withoutTemplate(fromPhases)), `${buildingId} whole trace`).toBe(
        compare(withoutTemplate(fromShape)),
      );
      // Not vacuous: the run really did generate people.
      expect(fromShape.passengers.length).toBeGreaterThan(0);
      /*
       * And the one excluded key is excluded for a reason that is *measured* here rather than
       * asserted above. `inReportWindow` is a label the report window puts on a leg after it is
       * drawn, not a property of the person drawn — so it is the only field that may differ, and it
       * differs in exactly the way the two windows say it should: the phase list reports the whole
       * run, so every leg is inside it; the shape reports its peak five minutes, so some are not.
       */
      expect(fromPhases.passengers.every((passenger) => passenger.inReportWindow)).toBe(true);
      expect(fromShape.passengers.some((passenger) => !passenger.inReportWindow)).toBe(true);
      expect(fromPhases.passengersInReportWindow).toBe(fromPhases.passengers.length);
      expect(fromShape.passengersInReportWindow).toBeLessThan(fromShape.passengers.length);
    }, 120_000);
  }
});

/* -------------------------------------------------------------------------- *
 * Claim 2 — the five that shipped before the day profile did not move
 * -------------------------------------------------------------------------- */

describe('adding office-day moves nothing that shipped before it', () => {
  it('every template that shipped before resolves to the same object', async () => {
    for (const id of DEMAND_TEMPLATE_IDS) {
      expect(
        resolveDemandTemplate(id, config.trafficProfiles.demandTemplates),
        id,
      ).toEqual(resolveDemandTemplate(id, stripped.demandTemplates));
    }
    // And the strip really removed something, or the comparison above is a tautology.
    expect(config.trafficProfiles.demandTemplates.length - stripped.demandTemplates.length).toBe(1);
  }, 60_000);

  for (const buildingId of BUILDING_IDS) {
    for (const id of DEMAND_TEMPLATE_IDS) {
      it(`${buildingId}|${id} traces identically with and without the sixth record`, async () => {
        const building = config.buildingsById.get(buildingId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        const withDay = generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          template: id,
        });
        const withoutDay = generateTrace({
          building,
          profiles: stripped,
          streams: new StreamSet(SEED),
          template: id,
        });
        expect(JSON.stringify(withDay), `${buildingId}|${id}`).toBe(JSON.stringify(withoutDay));
      }, 120_000);
    }
  }

  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId} runs identically with and without the sixth record`, async () => {
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
          seed: 20260805,
          onTimeout: 'report',
        });

      expect(JSON.stringify(run(config.trafficProfiles)), buildingId).toBe(
        JSON.stringify(run(stripped)),
      );
    }, 180_000);
  }
});

/* -------------------------------------------------------------------------- *
 * The shipped record, and the sentence it makes about the cited period
 * -------------------------------------------------------------------------- */

describe('office-day is a sequence of periods, and the lunch one is the cited arc itself', () => {
  /** 12:15, as seconds from the day's own 08:00 start. */
  const LUNCH_START_S = (12 * 60 + 15 - 8 * 60) * 60;

  it('resolves as an authored phase list, over ten hours, from 08:00', async () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    expect(day.authoredPhaseList).toBe(true);
    expect(day.durationS).toBe(600 * 60);
    expect(day.startOfDayS).toBe(8 * 3600);
    // Reported over the whole of itself: a five-minute window cut out of a day reports one of its
    // periods and calls it the day.
    expect(day.reportWindowStartS).toBe(0);
    expect(day.reportWindowEndS).toBe(day.durationS);
    // Not recommended, and the record's own `$comment` says why: one day is one long run.
    expect(day.recommended).toBe(false);
    expect(day.phases.length).toBe(17);
  }, 60_000);

  it('holds three separate peaks at full intensity, where the clock says', async () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    const at = (hour: number, minute: number): number => (hour * 60 + minute - 8 * 60) * 60;
    // The three cited periods, at their reported instants.
    expect(intensityAt(day, at(8, 45)), 'the morning up-peak').toBe(1);
    expect(intensityAt(day, at(12, 30)), 'the lunch two-way peak').toBe(1);
    expect(intensityAt(day, at(17, 30)), 'the evening down-peak').toBe(1);
    // And the interpolations between them are genuinely between: not a peak, not nothing.
    for (const [label, timeS] of [
      ['mid-morning', at(10, 30)],
      ['mid-afternoon', at(15, 0)],
    ] as const) {
      const level = intensityAt(day, timeS);
      expect(level, label).toBeGreaterThan(0.05);
      expect(level, label).toBeLessThan(1);
    }
    // The day opens and closes on the trickle.
    expect(intensityAt(day, at(8, 10))).toBeCloseTo(0.05, 12);
    expect(intensityAt(day, at(17, 55))).toBeCloseTo(0.05, 12);
  }, 60_000);

  it("the 12:15-12:45 mix is lunch-two-way's arc, not an approximation of it", async () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    const lunch = resolveDemandTemplate('lunch-two-way', config.trafficProfiles.demandTemplates);

    for (let step = 0; step <= 300; step += 1) {
      const offsetS = (lunch.durationS * step) / 300;
      const fromDay = splitAt(day, LUNCH_START_S + offsetS);
      const fromLunch = splitAt(lunch, offsetS);
      expect(fromDay, `t+${String(offsetS)}`).toBeDefined();
      const shares = fromDay as NonNullable<typeof fromDay>;
      const cited = fromLunch as NonNullable<typeof fromLunch>;
      for (const key of ['incoming', 'outgoing', 'interfloor'] as const) {
        expect(shares[key], `${key} at t+${String(offsetS)}`).toBeCloseTo(cited[key], 12);
      }
    }
    // And it crosses the cited 45/45/10 at 12:30, which is what the record says the midpoint is.
    const crossover = splitAt(day, LUNCH_START_S + lunch.durationS / 2);
    expect(crossover?.incoming).toBeCloseTo(0.45, 12);
    expect(crossover?.outgoing).toBeCloseTo(0.45, 12);
    expect(crossover?.interfloor).toBeCloseTo(0.1, 12);
  }, 60_000);

  it('swings the mix across the day, which is the thing a level-only schedule cannot do', async () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    const at = (hour: number, minute: number): number => (hour * 60 + minute - 8 * 60) * 60;
    const morning = splitAt(day, at(8, 45));
    const midday = splitAt(day, at(10, 30));
    const evening = splitAt(day, at(17, 30));
    // § D156 measured the shipped templates flat in the mix and named that as structural. A day
    // that varied only its *level* would be the same finding with more phases.
    expect(morning?.incoming).toBeCloseTo(0.85, 12);
    expect(midday?.incoming).toBeCloseTo(0.45, 12);
    expect(evening?.outgoing).toBeCloseTo(0.85, 12);
    expect(day.meanDirectionalSplit).toBeDefined();
  }, 60_000);

  it('generates a whole day of legs, and the crowd turns round between the peaks', async () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const trace = generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
      template: DAY_ID,
    });
    expect(trace.durationS).toBe(600 * 60);
    expect(trace.startOfDayS).toBe(8 * 3600);
    expect(trace.passengers.length).toBeGreaterThan(1000);

    /** The share of a window's legs that begin at an entrance floor. */
    const entrances = new Set(building.entranceFloors.map((floor) => floor.id));
    const inboundShare = (fromS: number, toS: number): number => {
      const window = trace.passengers.filter(
        (passenger) => passenger.arrivalTimeS >= fromS && passenger.arrivalTimeS < toS,
      );
      expect(window.length, `${String(fromS)}..${String(toS)} is not empty`).toBeGreaterThan(20);
      return window.filter((passenger) => entrances.has(passenger.originFloorId)).length /
        window.length;
    };
    const at = (hour: number, minute: number): number => (hour * 60 + minute - 8 * 60) * 60;
    const morning = inboundShare(at(8, 40), at(8, 50));
    const evening = inboundShare(at(17, 25), at(17, 35));
    // The measurement, not the assertion, is the point: the same building, the same run, and the
    // direction of travel reverses between two periods of one template. Loose bounds deliberately —
    // this is a statement about the *sign* of the effect, and the record's own numbers are what say
    // how big it is.
    expect(morning, 'morning: most legs start in the lobby').toBeGreaterThan(0.6);
    expect(evening, 'evening: most legs start upstairs').toBeLessThan(0.3);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The two refusals (§ D275)
 * -------------------------------------------------------------------------- */

describe('a phase list refuses the two knobs that assume a shape', () => {
  it('refuses templateOverrides.durationS by name, with the reason', async () => {
    expect(() =>
      resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates, { durationS: 900 }),
    ).toThrow(/templateOverrides\.durationS cannot be applied/u);
    expect(() =>
      resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates, { durationS: 900 }),
    ).toThrow(/a fifteen-minute day with a five-minute lunch|five-minute lunch/u);
  }, 60_000);

  it('refuses the other geometry overrides as a group', async () => {
    expect(() =>
      resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates, { peakWindowS: 60 }),
    ).toThrow(/no ramp to hold, no trough to raise/u);
  }, 60_000);

  it('leaves the five shape templates able to take an override', async () => {
    // The refusal must be about the phase list and not about overrides in general.
    const shortened = resolveDemandTemplate(
      'rise-and-fall',
      config.trafficProfiles.demandTemplates,
      { durationS: 900 },
    );
    expect(shortened.durationS).toBe(900);
  }, 60_000);

  it('refuses dayVariation.peakShiftS by name, for a stated reason', async () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    // A whole run, so the refusal is proved where a caller actually meets it.
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    expect(() =>
      generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(SEED),
        template: DAY_ID,
        dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 300 },
      }),
    ).toThrow(/peakShiftS is not supported on demand template "office-day"/u);

    // And the reason is the one recorded, not a bound that could be relaxed: the limit this
    // template *would* have computed is a boundary nobody thinks of as its peak.
    expect(day.phases[0]?.endS).toBe(30 * 60);
  }, 60_000);

  it('leaves the shape templates able to take a peak shift', async () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const trace = generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
      template: 'rise-and-fall',
      dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 300 },
    });
    expect(trace.passengers.length).toBeGreaterThan(0);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The rules the shape builders used to keep by construction
 * -------------------------------------------------------------------------- */

describe('the resolver refuses a phase list the builders could never have emitted', () => {
  const base = {
    id: 'broken',
    name: 'broken',
    recommended: false,
    durationMin: 30,
  } as const;

  const cases: readonly (readonly [string, DemandTemplate, RegExp])[] = [
    [
      'an empty list',
      { ...base, phases: [] },
      /at least one phase/u,
    ],
    [
      'a gap between two phases',
      {
        ...base,
        phases: [
          { startMin: 0, endMin: 10, startIntensity: 0, endIntensity: 1 },
          { startMin: 20, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /contiguous and ascending/u,
    ],
    [
      'an overlap',
      {
        ...base,
        phases: [
          { startMin: 0, endMin: 20, startIntensity: 0, endIntensity: 1 },
          { startMin: 10, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /contiguous and ascending/u,
    ],
    [
      'a list that does not start at 0',
      {
        ...base,
        phases: [{ startMin: 5, endMin: 30, startIntensity: 1, endIntensity: 1 }],
      },
      /must begin at 0/u,
    ],
    [
      'a list that stops before the duration',
      {
        ...base,
        phases: [{ startMin: 0, endMin: 20, startIntensity: 1, endIntensity: 1 }],
      },
      /must end exactly at duration/u,
    ],
    [
      'a zero-length phase',
      {
        ...base,
        phases: [
          { startMin: 0, endMin: 0, startIntensity: 1, endIntensity: 1 },
          { startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1 },
        ],
      },
      /strictly after/u,
    ],
    [
      'an undeclared step in the intensity',
      {
        ...base,
        phases: [
          { startMin: 0, endMin: 15, startIntensity: 0, endIntensity: 0.5 },
          { startMin: 15, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /undeclared step/u,
    ],
    [
      'an intensity above 1',
      {
        ...base,
        phases: [{ startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1.5 }],
      },
      /must lie in \[0, 1\]/u,
    ],
    [
      'a mix declared on one phase only',
      {
        ...base,
        phases: [
          {
            startMin: 0,
            endMin: 15,
            startIntensity: 1,
            endIntensity: 1,
            startSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
            endSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          },
          { startMin: 15, endMin: 30, startIntensity: 1, endIntensity: 1 },
        ],
      },
      /every phase or on none/u,
    ],
    [
      'one endpoint mix without the other',
      {
        ...base,
        phases: [
          {
            startMin: 0,
            endMin: 30,
            startIntensity: 1,
            endIntensity: 1,
            startSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          },
        ],
      },
      /both endpoint mixes or neither/u,
    ],
    [
      'an undeclared step in the mix',
      {
        ...base,
        phases: [
          {
            startMin: 0,
            endMin: 15,
            startIntensity: 1,
            endIntensity: 1,
            startSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
            endSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          },
          {
            startMin: 15,
            endMin: 30,
            startIntensity: 1,
            endIntensity: 1,
            startSplit: { incoming: 0, outgoing: 1, interfloor: 0 },
            endSplit: { incoming: 0, outgoing: 1, interfloor: 0 },
          },
        ],
      },
      /undeclared step in the directional mix/u,
    ],
  ];

  for (const [label, record, pattern] of cases) {
    it(`refuses ${label}`, () => {
      expect(() => resolveDemandTemplate(record)).toThrow(TrafficError);
      expect(() => resolveDemandTemplate(record)).toThrow(pattern);
    });
  }

  it('names the phase, so an author knows which one to fix', () => {
    expect(() =>
      resolveDemandTemplate({
        ...base,
        phases: [
          { startMin: 0, endMin: 10, startIntensity: 0, endIntensity: 1 },
          { startMin: 10, endMin: 20, startIntensity: 1, endIntensity: 1 },
          { startMin: 25, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      }),
    ).toThrow(/phases\[2\]\.startMin/u);
  });

  it('accepts a hand-built resolved phase list, and still checks it', () => {
    const good: ResolvedDemandTemplate = {
      id: 'hand-built',
      name: 'hand-built',
      recommended: false,
      durationS: 600,
      phases: [{ startS: 0, endS: 600, startIntensity: 1, endIntensity: 1 }],
      reportWindowStartS: 0,
      reportWindowEndS: 600,
      peakIntensity: 1,
      intensityIntegralS: 600,
      authoredPhaseList: true,
    };
    // The already-resolved path returns its argument untouched — but the marker still reaches the
    // peak-shift refusal, which is the one thing that reads it.
    expect(resolveDemandTemplate(good).authoredPhaseList).toBe(true);
  });
});
